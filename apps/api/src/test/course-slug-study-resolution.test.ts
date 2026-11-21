import { describe, it, expect, beforeEach } from "vitest";
import type {
  CourseId,
  FlashcardId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryStudySessionStore,
  InMemoryFlashcardStudySessionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

describe("Course Slug vs UUID Boundary & Study Resolution Audit", () => {
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let studySessionStore: InMemoryStudySessionStore;
  let flashcardStudySessionStore: InMemoryFlashcardStudySessionStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const validCourseUUID: CourseId = "11111111-2222-4333-8444-555555555555" as CourseId;
  const validCourseSlug = "course-cardio-101";

  const otherOrgCourseUUID: CourseId = "99999999-9999-4999-8999-999999999999" as CourseId;
  const otherOrgCourseSlug = "course-other-org";

  const deletedCourseUUID: CourseId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as CourseId;
  const deletedCourseSlug = "course-deleted";

  const officialCourseUUID: CourseId = "ffffffff-ffff-4fff-8fff-ffffffffffff" as CourseId;
  const officialCourseSlug = "course-official-slug";

  beforeEach(() => {
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(orgStore);
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    studySessionStore = new InMemoryStudySessionStore();
    flashcardStudySessionStore = new InMemoryFlashcardStudySessionStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildTestApp() {
    const config = loadApiConfig();
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
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      studySessionStore,
      flashcardStudySessionStore,
      auditService,
    });
    return app;
  }

  async function registerUser(app: any, email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password123",
        name: email.split("@")[0],
        phoneNumber: `0912${Math.floor(1000000 + Math.random() * 9000000)}`,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const cookie = res.cookies.find((c: any) => c.name === "avana_session");
    return { token: cookie.value, userId: body.user.id as UserId };
  }

  async function setupFixtures(app: any) {
    const { token: userToken, userId } = await registerUser(app, "student@avana.ai");
    const { token: otherToken, userId: otherUserId } = await registerUser(app, "other@avana.ai");

    // 1. Create Organization 1
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: userToken },
      payload: { name: "Org 1" },
    });
    const orgId = JSON.parse(orgRes.body).organization.id as OrganizationId;

    // 2. Create Organization 2
    const otherOrgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: otherToken },
      payload: { name: "Org 2" },
    });
    const otherOrgId = JSON.parse(otherOrgRes.body).organization.id as OrganizationId;

    const now = new Date().toISOString();
    const past = new Date(Date.now() - 60000).toISOString();

    // Course 1 (Org 1, accessible to user)
    await courseStore.create({
      course: {
        id: validCourseUUID,
        organizationId: orgId,
        title: "Cardiology 101",
        slug: validCourseSlug,
        description: "Course for slug testing",
        status: "published",
        isOfficial: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });

    // Course 2 (Org 2, belonging to other organization)
    await courseStore.create({
      course: {
        id: otherOrgCourseUUID,
        organizationId: otherOrgId,
        title: "Neurology",
        slug: otherOrgCourseSlug,
        description: "Course for Org 2",
        status: "published",
        isOfficial: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });

    // Course 3 (Deleted course)
    await courseStore.create({
      course: {
        id: deletedCourseUUID,
        organizationId: orgId,
        title: "Deleted Anatomy",
        slug: deletedCourseSlug,
        description: "Soft deleted course",
        status: "published",
        isOfficial: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      },
    });

    // Course 4 (Official published course)
    await courseStore.create({
      course: {
        id: officialCourseUUID,
        organizationId: orgId,
        title: "Official Pharmacology",
        slug: officialCourseSlug,
        description: "Published official course",
        status: "published",
        isOfficial: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });

    // Seed Flashcards for validCourseUUID
    const cardId1: FlashcardId = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa" as FlashcardId;
    flashcardStore.insert({
      id: cardId1,
      organizationId: orgId,
      courseId: validCourseUUID,
      documentId: null,
      generatedContentId: null,
      question: "Beta blocker mechanism?",
      answer: "Blocks beta receptors.",
      cardType: "definition",
      difficulty: "easy",
      dueAt: past,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: past,
      updatedAt: past,
      deletedAt: null,
    });

    flashcardReviewStore.create({
      id: "review-1",
      flashcardId: cardId1,
      userId,
      rating: "good",
      reviewedAt: past,
      reactionMs: 1000,
    });
    userFlashcardScheduleStore.upsertSchedule({
      userId,
      flashcardId: cardId1,
      dueAt: past,
      intervalDays: 1,
      easeFactor: 2.5,
      reviewCount: 1,
    });

    // Seed Flashcards for officialCourseUUID
    const officialCardId: FlashcardId = "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb" as FlashcardId;
    flashcardStore.insert({
      id: officialCardId,
      organizationId: orgId,
      courseId: officialCourseUUID,
      documentId: null,
      generatedContentId: null,
      question: "Official course question?",
      answer: "Official answer.",
      cardType: "definition",
      difficulty: "easy",
      dueAt: past,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: past,
      updatedAt: past,
      deletedAt: null,
    });

    flashcardReviewStore.create({
      id: "review-2",
      flashcardId: officialCardId,
      userId,
      rating: "good",
      reviewedAt: past,
      reactionMs: 1000,
    });
    userFlashcardScheduleStore.upsertSchedule({
      userId,
      flashcardId: officialCardId,
      dueAt: past,
      intervalDays: 1,
      easeFactor: 2.5,
      reviewCount: 1,
    });

    return {
      userToken,
      userId,
      otherToken,
      otherUserId,
      orgId,
      otherOrgId,
      cardId1,
    };
  }

  // -------------------------------------------------------------------------
  // 1 & 2 & 3: start study session scenarios
  // -------------------------------------------------------------------------

  it("1. starts study session with valid Course UUID (201 created)", async () => {
    const app = await buildTestApp();
    const { userToken } = await setupFixtures(app);

    const res = await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: userToken },
      payload: {
        activityType: "lesson",
        courseId: validCourseUUID,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.session.id).toBeDefined();
    expect(body.session.courseId).toBe(validCourseUUID);
  });

  it("2. starts study session with valid Course Slug (201 created & resolves to safeCourseId UUID)", async () => {
    const app = await buildTestApp();
    const { userToken } = await setupFixtures(app);

    const res = await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: userToken },
      payload: {
        activityType: "lesson",
        courseId: validCourseSlug, // Public Slug
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.session.id).toBeDefined();
    // Must be resolved to canonical UUID, NEVER the raw slug
    expect(body.session.courseId).toBe(validCourseUUID);

    // Verify stored session in DB/store has UUID
    const stored = await studySessionStore.findById(body.session.id);
    expect(stored?.courseId).toBe(validCourseUUID);
  });

  it("3. rejects start study session with invalid Course Slug with 404 (no 500 DB crash)", async () => {
    const app = await buildTestApp();
    const { userToken } = await setupFixtures(app);

    const res = await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: userToken },
      payload: {
        activityType: "lesson",
        courseId: "course-81924dec", // Invalid or non-existent slug
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(500);
  });

  // -------------------------------------------------------------------------
  // 4 & 5 & 6: get review queue scenarios
  // -------------------------------------------------------------------------

  it("4. gets review queue with valid Course UUID (200 OK)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${validCourseUUID}`,
      cookies: { avana_session: userToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.due_cards).toBeDefined();
    expect(body.due_cards.length).toBe(1);
    expect(body.due_cards[0].course_id).toBe(validCourseUUID);
  });

  it("5. gets review queue with valid Course Slug (200 OK)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${validCourseSlug}`,
      cookies: { avana_session: userToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.due_cards).toBeDefined();
    expect(body.due_cards.length).toBe(1);
    expect(body.due_cards[0].course_id).toBe(validCourseUUID);
  });

  it("6. rejects review queue with invalid course identifier with 404 (no 500 DB error)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=course-81924dec`,
      cookies: { avana_session: userToken },
    });

    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(500);
  });

  // -------------------------------------------------------------------------
  // 7. Organization isolation
  // -------------------------------------------------------------------------

  it("7. rejects access to course belonging to another organization (404 / unauthorized)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    // User is in Org 1, trying to access course from Org 2
    const resUuid = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${otherOrgCourseUUID}`,
      cookies: { avana_session: userToken },
    });
    expect([403, 404]).toContain(resUuid.statusCode);

    const resSlug = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${otherOrgCourseSlug}`,
      cookies: { avana_session: userToken },
    });
    expect([403, 404]).toContain(resSlug.statusCode);
  });

  // -------------------------------------------------------------------------
  // 8. Soft-deleted course
  // -------------------------------------------------------------------------

  it("8. rejects soft-deleted course with Slug or UUID (404 not found)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    const resUuid = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${deletedCourseUUID}`,
      cookies: { avana_session: userToken },
    });
    expect(resUuid.statusCode).toBe(404);

    const resSlug = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${deletedCourseSlug}`,
      cookies: { avana_session: userToken },
    });
    expect(resSlug.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 9. Published official course
  // -------------------------------------------------------------------------

  it("9. allows access to published official course with Slug and UUID (200 OK)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    const resUuid = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${officialCourseUUID}`,
      cookies: { avana_session: userToken },
    });
    expect(resUuid.statusCode).toBe(200);

    const resSlug = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${officialCourseSlug}`,
      cookies: { avana_session: userToken },
    });
    expect(resSlug.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 10. Multi-course filter with one invalid ID
  // -------------------------------------------------------------------------

  it("10. rejects multi-course filter if any identifier is invalid (does not silently drop filter)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    // Combination of valid course and non-existent/invalid course
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/review-queue?courseIds=${validCourseSlug},course-invalid-fake`,
      cookies: { avana_session: userToken },
    });

    // Entire request must fail rather than dropping course-invalid-fake and returning unfiltered cards
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(500);
  });

  // -------------------------------------------------------------------------
  // 11. Flashcard study session with Slug and UUID
  // -------------------------------------------------------------------------

  it("11. creates flashcard study session with Slug and UUID (201 created)", async () => {
    const app = await buildTestApp();
    const { userToken, orgId } = await setupFixtures(app);

    // With UUID
    const resUuid = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/flashcard-sessions`,
      cookies: { avana_session: userToken },
      payload: {
        courseId: validCourseUUID,
      },
    });
    expect(resUuid.statusCode).toBe(201);
    const bodyUuid = JSON.parse(resUuid.body);
    expect(bodyUuid.session.course_id).toBe(validCourseUUID);

    // With Slug
    const resSlug = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/flashcard-sessions`,
      cookies: { avana_session: userToken },
      payload: {
        courseId: validCourseSlug,
      },
    });
    expect(resSlug.statusCode).toBe(201);
    const bodySlug = JSON.parse(resSlug.body);
    // Stored courseId must be canonical UUID
    expect(bodySlug.session.course_id).toBe(validCourseUUID);
  });

  // -------------------------------------------------------------------------
  // 12. New flashcards after completing lesson with course slug & onlyStudied=true
  // -------------------------------------------------------------------------

  it("12. retrieves new flashcards after completing lesson with course slug and onlyStudied=true, and summary contains slug", async () => {
    const app = await buildTestApp();
    const { userToken, userId, orgId } = await setupFixtures(app);

    const now = new Date().toISOString();
    const testModuleId = "22222222-2222-4222-8222-222222222222" as ModuleId;
    const lesson1Id = "33333333-3333-4333-8333-333333333331" as LessonId;
    const lesson2Id = "33333333-3333-4333-8333-333333333332" as LessonId;

    moduleStore.insert({
      id: testModuleId,
      courseId: validCourseUUID,
      documentId: null,
      subCourseGroupId: null,
      title: "Module 1",
      description: "Module 1 desc",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    lessonStore.insert({
      id: lesson1Id,
      moduleId: testModuleId,
      title: "Lesson 1",
      slug: "lesson-1",
      contentType: "text",
      contentUrl: null,
      durationMinutes: 10,
      sortOrder: 1,
      isFreePreview: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    lessonStore.insert({
      id: lesson2Id,
      moduleId: testModuleId,
      title: "Lesson 2",
      slug: "lesson-2",
      contentType: "text",
      contentUrl: null,
      durationMinutes: 10,
      sortOrder: 2,
      isFreePreview: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const newCard1Id = "cccccccc-1111-4ccc-8ccc-cccccccccccc" as FlashcardId;
    const newCard2Id = "cccccccc-2222-4ccc-8ccc-cccccccccccc" as FlashcardId;

    flashcardStore.insert({
      id: newCard1Id,
      organizationId: orgId,
      courseId: validCourseUUID,
      lessonId: lesson1Id,
      documentId: null,
      generatedContentId: null,
      question: "Lesson 1 Question",
      answer: "Lesson 1 Answer",
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    flashcardStore.insert({
      id: newCard2Id,
      organizationId: orgId,
      courseId: validCourseUUID,
      lessonId: lesson2Id,
      documentId: null,
      generatedContentId: null,
      question: "Lesson 2 Question",
      answer: "Lesson 2 Answer",
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Verify summary returns slug alongside course_id
    const summaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcard-summary`,
      cookies: { avana_session: userToken },
    });
    expect(summaryRes.statusCode).toBe(200);
    const summaryBody = JSON.parse(summaryRes.body);
    const validCourseSummary = summaryBody.courses.find((c: any) => c.course_id === validCourseUUID);
    expect(validCourseSummary).toBeDefined();
    expect(validCourseSummary.slug).toBe(validCourseSlug);

    // 2. Before completing any lesson: custom-queue with onlyStudied=true returns 0 cards
    const queueBefore = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/custom-queue?courseIds=${validCourseSlug}&mode=new&onlyStudied=true`,
      cookies: { avana_session: userToken },
    });
    expect(queueBefore.statusCode).toBe(200);
    const bodyBefore = JSON.parse(queueBefore.body);
    expect(bodyBefore.items).toHaveLength(0);

    // 3. Mark Lesson 1 as completed
    await progressStore.upsert({
      id: "prog-1",
      userId,
      lessonId: lesson1Id,
      completed: true,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 4. After completing Lesson 1: custom-queue returns card from Lesson 1, but NOT Lesson 2
    const queueAfterLesson1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/custom-queue?courseIds=${validCourseSlug}&mode=new&onlyStudied=true`,
      cookies: { avana_session: userToken },
    });
    expect(queueAfterLesson1.statusCode).toBe(200);
    const bodyAfterLesson1 = JSON.parse(queueAfterLesson1.body);
    expect(bodyAfterLesson1.items).toHaveLength(1);
    expect(bodyAfterLesson1.items[0].id).toBe(newCard1Id);

    // 5. Mark Lesson 2 as completed
    await progressStore.upsert({
      id: "prog-2",
      userId,
      lessonId: lesson2Id,
      completed: true,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 6. After completing Lesson 2: custom-queue returns cards from both lessons
    const queueAfterLesson2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/flashcards/custom-queue?courseIds=${validCourseSlug}&mode=new&onlyStudied=true`,
      cookies: { avana_session: userToken },
    });
    expect(queueAfterLesson2.statusCode).toBe(200);
    const bodyAfterLesson2 = JSON.parse(queueAfterLesson2.body);
    expect(bodyAfterLesson2.items).toHaveLength(2);
    const returnedIds = bodyAfterLesson2.items.map((c: any) => c.id);
    expect(returnedIds).toContain(newCard1Id);
    expect(returnedIds).toContain(newCard2Id);
  });

  describe("Store Hardening Guards", () => {
    it("returns undefined without querying DB when courseId is an invalid UUID slug (DrizzleCourseStore)", async () => {
      const { DrizzleCourseStore } = await import("../modules/courses/drizzle-stores.js");

      const explodingDb: any = {
        select: () => {
          throw new Error("DB should never be queried for invalid UUID format");
        },
      };

      const drizzleStore = new DrizzleCourseStore(explodingDb);

      expect(await drizzleStore.findById("course-81924dec" as any)).toBeUndefined();
      expect(
        await drizzleStore.findByIdForUser(
          "course-81924dec" as any,
          "11111111-1111-4111-8111-111111111111" as UserId,
        ),
      ).toBeUndefined();
      expect(await drizzleStore.findById("" as any)).toBeUndefined();
      expect(await drizzleStore.findById(null as any)).toBeUndefined();
    });

    it("returns empty array without querying DB when courseId is non-UUID (DrizzleModuleStore & DrizzleProgressStore)", async () => {
      const { DrizzleModuleStore, DrizzleProgressStore } = await import("../modules/learning/drizzle-stores.js");

      const explodingDb: any = {
        select: () => {
          throw new Error("DB should never be queried for invalid UUID format");
        },
      };

      const moduleStore = new DrizzleModuleStore(explodingDb);
      const progressStore = new DrizzleProgressStore(explodingDb);

      expect(await moduleStore.listByCourse("course-slug" as any)).toEqual([]);
      expect(
        await progressStore.listByUserAndCourse(
          "11111111-1111-4111-8111-111111111111" as UserId,
          "course-slug" as any,
        ),
      ).toEqual([]);
    });
  });
});

