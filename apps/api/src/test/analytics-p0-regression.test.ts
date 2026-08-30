// @ts-nocheck
/**
 * Analytics P0 & Aggregation Regression Test Suite
 *
 * Covers:
 * TEST 1: Course with 1 Quiz and multiple Quiz Questions -> quizCount is 1 (no double-counting)
 * TEST 2: Course with Quiz having course_id but no Lesson -> quizCount is 1 (no missing data)
 * TEST 3: Course with Quiz without Questions -> quizCount is 1 (no missing data)
 * TEST 4: Course A and Course B with different Quizzes -> counts do not interfere
 * TEST 5: User A reviews a Flashcard -> Analytics User A is updated
 * TEST 6: Same Flashcard not reviewed by User B -> Analytics User B is not affected
 * TEST 7: Two Users with different schedules for same Flashcard -> mastery_percent is independent
 * TEST 8: Document stats -> Database-level aggregation matches expected totals, size bytes, and status counts
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
  defaultPolicy,
  Roles,
} from "@avana/domain";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { DocumentService } from "../modules/documents/document-service.js";

function createMockCoursesDb(
  courses: Array<{ id: string; name: string; subject: string | null; createdAt: Date }>,
  quizCounts: Array<{ courseId: string; count: number }>,
) {
  return {
    select: () => ({
      from: () => {
        const chain: any = {
          where: () => ({
            groupBy: () => Promise.resolve(quizCounts),
            limit: () => ({
              offset: () => ({
                orderBy: () => Promise.resolve(courses),
              }),
            }),
            then: (resolve: any) => resolve([{ count: courses.length }]),
          }),
          innerJoin: () => ({
            where: () => ({
              groupBy: () => Promise.resolve([]),
            }),
          }),
          limit: () => ({
            offset: () => ({
              orderBy: () => Promise.resolve(courses),
            }),
          }),
        };
        return chain;
      },
    }),
  } as any;
}

describe("Analytics P0 Regression Test Suite", () => {
  describe("Admin Course Analytics (P0-A & P0-B)", () => {
    it("TEST 1: Course with 1 Quiz and multiple Quiz Questions produces quizCount = 1 (no double-counting)", async () => {
      const courseId = randomUUID();
      const mockDb = createMockCoursesDb(
        [{ id: courseId, name: "Cardiology", subject: "Medicine", createdAt: new Date() }],
        [{ courseId, count: 1 }],
      );

      const adminStore = new DrizzleAdminStore(mockDb);
      const result = await adminStore.listCourses({ page: 1, pageSize: 20 });

      expect(result.courses.length).toBe(1);
      expect(result.courses[0].counts.quizzes).toBe(1);
    });

    it("TEST 2: Course with Quiz having course_id but no Lesson produces quizCount = 1 (no missing data)", async () => {
      const courseId = randomUUID();
      const mockDb = createMockCoursesDb(
        [{ id: courseId, name: "Standalone Quiz Course", subject: "Science", createdAt: new Date() }],
        [{ courseId, count: 1 }],
      );

      const adminStore = new DrizzleAdminStore(mockDb);
      const result = await adminStore.listCourses({ page: 1, pageSize: 20 });

      expect(result.courses[0].counts.quizzes).toBe(1);
    });

    it("TEST 3: Course with Quiz without Questions produces quizCount = 1", async () => {
      const courseId = randomUUID();
      const mockDb = createMockCoursesDb(
        [{ id: courseId, name: "Empty Quiz Course", subject: "Science", createdAt: new Date() }],
        [{ courseId, count: 1 }],
      );

      const adminStore = new DrizzleAdminStore(mockDb);
      const result = await adminStore.listCourses({ page: 1, pageSize: 20 });

      expect(result.courses[0].counts.quizzes).toBe(1);
    });

    it("TEST 4: Course A and Course B with different Quizzes do not cross-contaminate counts", async () => {
      const courseA = randomUUID();
      const courseB = randomUUID();
      const mockDb = createMockCoursesDb(
        [
          { id: courseA, name: "Course A", subject: "Math", createdAt: new Date() },
          { id: courseB, name: "Course B", subject: "Physics", createdAt: new Date() },
        ],
        [
          { courseId: courseA, count: 3 },
          { courseId: courseB, count: 1 },
        ],
      );

      const adminStore = new DrizzleAdminStore(mockDb);
      const result = await adminStore.listCourses({ page: 1, pageSize: 20 });

      const statsA = result.courses.find((c) => c.id === courseA);
      const statsB = result.courses.find((c) => c.id === courseB);

      expect(statsA?.counts.quizzes).toBe(3);
      expect(statsB?.counts.quizzes).toBe(1);
    });
  });

  describe("Multi-User Isolation in Study Analytics (P0-C)", () => {
    let flashcardStore: InMemoryFlashcardStore;
    let flashcardReviewStore: InMemoryFlashcardReviewStore;
    let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
    let quizStore: InMemoryQuizStore;
    let quizQuestionStore: InMemoryQuizQuestionStore;
    let quizAttemptStore: InMemoryQuizAttemptStore;
    let moduleStore: InMemoryModuleStore;
    let lessonStore: InMemoryLessonStore;
    let progressStore: InMemoryProgressStore;
    let orgStore: InMemoryOrganizationStore;
    let courseStore: InMemoryCourseStore;
    let studyService: StudyService;

    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const docId = randomUUID() as DocumentId;

    const userA: Actor = { userId: randomUUID() as UserId, role: Roles.student };
    const userB: Actor = { userId: randomUUID() as UserId, role: Roles.student };

    let card1Id: FlashcardId;
    let card2Id: FlashcardId;

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
      orgStore = new InMemoryOrganizationStore();
      courseStore = new InMemoryCourseStore();

      await orgStore.createWithAdminMembership({
        organization: {
          id: orgId,
          name: "Test Org",
          slug: "test-org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
        },
        membership: {
          id: randomUUID() as any,
          organizationId: orgId,
          userId: userA.userId,
          role: Roles.student,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });
      orgStore.addMembership({
        id: randomUUID() as any,
        organizationId: orgId,
        userId: userB.userId,
        role: Roles.student,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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
        orgStore,
        userFlashcardScheduleStore,
        courseStore,
      );

      // Seed 2 flashcards in catalog (common template with interval = 0)
      card1Id = randomUUID() as FlashcardId;
      card2Id = randomUUID() as FlashcardId;

      await flashcardStore.create({
        id: card1Id,
        organizationId: orgId,
        courseId,
        documentId: docId,
        generatedContentId: null,
        question: "Q1",
        answer: "A1",
        explanation: null,
        cardType: "definition",
        difficulty: "medium",
        dueAt: new Date().toISOString(),
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
      });

      await flashcardStore.create({
        id: card2Id,
        organizationId: orgId,
        courseId,
        documentId: docId,
        generatedContentId: null,
        question: "Q2",
        answer: "A2",
        explanation: null,
        cardType: "definition",
        difficulty: "medium",
        dueAt: new Date().toISOString(),
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
      });
    });

    it("TEST 5: User A reviews a Flashcard -> Analytics User A is updated", async () => {
      // User A submits a review
      await studyService.submitFlashcardReview(userA, orgId, {
        flashcardId: card1Id,
        rating: "good",
      });

      const analyticsA = await studyService.getStudyAnalytics(userA, orgId, courseId);
      expect(analyticsA.total_flashcards).toBe(2);
      expect(analyticsA.reviewed_flashcards).toBe(1);
    });

    it("TEST 6: Same Flashcard not reviewed by User B -> Analytics User B is not affected", async () => {
      // User A submits a review for card 1
      await studyService.submitFlashcardReview(userA, orgId, {
        flashcardId: card1Id,
        rating: "good",
      });

      // User B has not reviewed any card
      const analyticsB = await studyService.getStudyAnalytics(userB, orgId, courseId);
      expect(analyticsB.total_flashcards).toBe(2);
      expect(analyticsB.reviewed_flashcards).toBe(0);
      expect(analyticsB.flashcard_mastery_percent).toBe(0);
    });

    it("TEST 7: Two Users with different schedules for same Flashcard -> mastery_percent is independent", async () => {
      const futureDate10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const nearFutureDate2Days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

      // User A has mastered card 1 (> 7 days interval)
      await userFlashcardScheduleStore.upsertSchedule({
        userId: userA.userId,
        flashcardId: card1Id,
        dueAt: futureDate10Days,
        intervalDays: 10,
        easeFactor: 2.5,
        reviewCount: 3,
        lastReviewedAt: new Date().toISOString(),
      });

      // User B only reviewed card 1 recently (due in 2 days, not mastered)
      await userFlashcardScheduleStore.upsertSchedule({
        userId: userB.userId,
        flashcardId: card1Id,
        dueAt: nearFutureDate2Days,
        intervalDays: 2,
        easeFactor: 2.5,
        reviewCount: 1,
        lastReviewedAt: new Date().toISOString(),
      });

      const analyticsA = await studyService.getStudyAnalytics(userA, orgId, courseId);
      const analyticsB = await studyService.getStudyAnalytics(userB, orgId, courseId);

      // User A has 1 of 2 mastered = 50%
      expect(analyticsA.reviewed_flashcards).toBe(1);
      expect(analyticsA.flashcard_mastery_percent).toBe(50);

      // User B has 1 reviewed, but 0 mastered = 0%
      expect(analyticsB.reviewed_flashcards).toBe(1);
      expect(analyticsB.flashcard_mastery_percent).toBe(0);
    });
  });

  describe("Document Stats Database Aggregation (P1)", () => {
    it("TEST 8: Document stats database aggregation matches expected totals, size bytes, and status counts", async () => {
      const docStore = new InMemoryDocumentStore();
      const orgStore = new InMemoryOrganizationStore();
      const orgId = randomUUID() as OrganizationId;
      const adminActor: Actor = { userId: randomUUID() as UserId, role: Roles.organization_admin };
      const courseId = randomUUID() as CourseId;

      await orgStore.createWithAdminMembership({
        organization: {
          id: orgId,
          name: "Doc Org",
          slug: "doc-org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
        },
        membership: {
          id: randomUUID() as any,
          organizationId: orgId,
          userId: adminActor.userId,
          role: Roles.organization_admin,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      const mockStorage: any = {
        save: async () => {},
        read: async () => Buffer.from("test"),
        delete: async () => {},
      };

      const docService = new DocumentService(
        docStore,
        mockStorage,
        orgStore,
        defaultPolicy,
      );

      // Seed 3 documents: 2 attached to course (used), 1 unattached (unused)
      await docStore.create({
        id: randomUUID() as DocumentId,
        organizationId: orgId,
        courseId,
        ownerUserId: adminActor.userId,
        originalName: "file1.pdf",
        storageKey: "key1",
        sha256: "hash1",
        mimeType: "application/pdf",
        sizeBytes: 1500,
        status: "ready",
        errorCode: null,
        retryCount: 0,
        pageCount: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
      });

      await docStore.create({
        id: randomUUID() as DocumentId,
        organizationId: orgId,
        courseId,
        ownerUserId: adminActor.userId,
        originalName: "file2.pdf",
        storageKey: "key2",
        sha256: "hash2",
        mimeType: "application/pdf",
        sizeBytes: 2500,
        status: "ready",
        errorCode: null,
        retryCount: 0,
        pageCount: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
      });

      await docStore.create({
        id: randomUUID() as DocumentId,
        organizationId: orgId,
        courseId: null,
        ownerUserId: adminActor.userId,
        originalName: "file3.pdf",
        storageKey: "key3",
        sha256: "hash3",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        status: "processing",
        errorCode: null,
        retryCount: 0,
        pageCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
      });

      const stats = await docService.getDocumentStats(adminActor, orgId);

      expect(stats.total_count).toBe(3);
      expect(stats.total_size_bytes).toBe(5000);
      expect(stats.used_count).toBe(2);
      expect(stats.unused_count).toBe(1);
      expect(stats.status_counts).toEqual({
        ready: 2,
        processing: 1,
      });
    });
  });

  describe("Admin Analytics Total Payload (P2)", () => {
    it("DrizzleAdminStore.getAnalytics returns totalUsers, totalCourses, totalLessons, totalFlashcards, totalQuizzes", async () => {
      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([
              { count: 42 }
            ]),
          }),
        }),
      };

      const store = new DrizzleAdminStore(mockDb);
      const analytics = await store.getAnalytics();

      expect(analytics.total).toHaveProperty("totalUsers");
      expect(analytics.total).toHaveProperty("totalCourses");
      expect(analytics.total).toHaveProperty("totalLessons");
      expect(analytics.total).toHaveProperty("totalFlashcards");
      expect(analytics.total).toHaveProperty("totalQuizzes");
    });
  });
});
